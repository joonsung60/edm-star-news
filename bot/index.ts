import { Bot, InlineKeyboard } from "grammy";

const BOT_TOKEN = "8994497493:AAGOAnT--Na12X7ZU6w-JVTw2EG4ZFsjzyY";
const ALLOWED_USERS = [8322528068];
const LOCAL_API = "http://localhost:3000";

const bot = new Bot(BOT_TOKEN);

// 허용된 사용자만 접근
bot.use(async (ctx, next) => {
  const userId = ctx.from?.id;
  if (!userId || !ALLOWED_USERS.includes(userId)) {
    await ctx.reply("접근 권한이 없습니다.");
    return;
  }
  await next();
});

// /start
bot.command("start", async (ctx) => {
  await ctx.reply(
    "EDM Star News 봇입니다.\n\n" +
    "/collect - RSS 수집\n" +
    "/suggest - 토픽 제안\n" +
    "/articles - 기사 초안 목록"
  );
});

// /collect
bot.command("collect", async (ctx) => {
  const msg = await ctx.reply("RSS 수집 중...");
  try {
    const res = await fetch(`${LOCAL_API}/api/collect`, { method: "POST" });
    const data = await res.json();
    const collected = data.collected ?? 0;
    const failed = data.failures?.length ?? 0;
    await ctx.api.editMessageText(
      ctx.chat.id,
      msg.message_id,
      `수집 완료\n새 기사: ${collected}개${failed > 0 ? `\n실패 소스: ${failed}개` : ""}`
    );
  } catch (e) {
    await ctx.api.editMessageText(ctx.chat.id, msg.message_id, `오류 발생: ${e}`);
  }
});

// /suggest
bot.command("suggest", async (ctx) => {
  const msg = await ctx.reply("토픽 제안 생성 중... (시간이 걸릴 수 있어요)");
  try {
    const res = await fetch(`${LOCAL_API}/api/suggest-clusters`, { method: "POST" });
    const data = await res.json();
    const suggestions = data.suggestions ?? [];

    if (suggestions.length === 0) {
      await ctx.api.editMessageText(ctx.chat.id, msg.message_id, "제안된 토픽이 없습니다.");
      return;
    }

    await ctx.api.editMessageText(
      ctx.chat.id,
      msg.message_id,
      `토픽 제안 ${suggestions.length}개 생성됨`
    );

    // 각 제안을 카드로 표시
    for (const s of suggestions) {
      const keywords = Array.isArray(s.keywords) ? s.keywords.join(", ") : s.keywords;
      const articleCount = s.articles?.length ?? s.articleIds?.length ?? 0;
      const text = `*${s.topic}*\n키워드: ${keywords}\n관련 기사: ${articleCount}개`;
      const keyboard = new InlineKeyboard()
        .text("기사 생성", `approve:${s.id}`)
        .text("거절", `reject:${s.id}`);
      await ctx.reply(text, { parse_mode: "Markdown", reply_markup: keyboard });
    }
  } catch (e) {
    await ctx.api.editMessageText(ctx.chat.id, msg.message_id, `오류 발생: ${e}`);
  }
});

// 기사 생성 버튼
bot.callbackQuery(/^approve:(.+)$/, async (ctx) => {
  const id = ctx.match[1];
  await ctx.answerCallbackQuery();
  await ctx.editMessageReplyMarkup({ reply_markup: new InlineKeyboard() });
  const msg = await ctx.reply("기사 생성 중...");

  try {
    // 1. approved 상태로 변경
    await fetch(`${LOCAL_API}/api/suggest-clusters/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "approved" }),
    });

    // 2. 클러스터 생성
    const suggestRes = await fetch(`${LOCAL_API}/api/suggest-clusters?status=approved`);
    const suggestData = await suggestRes.json();
    const suggestion = suggestData.suggestions?.find((s: any) => s.id === id);

    if (!suggestion) throw new Error("제안을 찾을 수 없음");

    const clusterRes = await fetch(`${LOCAL_API}/api/cluster`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        topic: suggestion.topic,
        keywords: suggestion.keywords,
        articleIds: suggestion.articleIds,
        matchMode: "or",
      }),
    });
    const clusterData = await clusterRes.json();
    const clusterId = clusterData.cluster?.id;

    if (!clusterId) throw new Error("클러스터 생성 실패");

    // 3. 기사 생성
    const genRes = await fetch(`${LOCAL_API}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clusterId }),
    });
    const genData = await genRes.json();
    const articleId = genData.article?.id;

    // 4. suggested_clusters 상태 published로
    await fetch(`${LOCAL_API}/api/suggest-clusters/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "published", cluster_id: clusterId }),
    });

    const keyboard = new InlineKeyboard()
      .text("게시", `publish:${articleId}`)
      .text("삭제", `delete:${articleId}`);

    await ctx.api.editMessageText(
      ctx.chat.id,
      msg.message_id,
      `기사 생성 완료\n*${genData.article?.title ?? "제목 없음"}*`,
      { parse_mode: "Markdown", reply_markup: keyboard }
    );
  } catch (e) {
    await ctx.api.editMessageText(ctx.chat.id, msg.message_id, `오류 발생: ${e}`);
  }
});

// 거절 버튼
bot.callbackQuery(/^reject:(.+)$/, async (ctx) => {
  const id = ctx.match[1];
  await ctx.answerCallbackQuery();
  await fetch(`${LOCAL_API}/api/suggest-clusters/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "rejected" }),
  });
  await ctx.editMessageReplyMarkup({ reply_markup: new InlineKeyboard() });
  await ctx.reply("거절됨");
});

// /articles
bot.command("articles", async (ctx) => {
  try {
    const res = await fetch(`${LOCAL_API}/api/articles?published=false`);
    const data = await res.json();
    const articles = data.articles ?? [];

    if (articles.length === 0) {
      await ctx.reply("게시 대기 중인 기사가 없습니다.");
      return;
    }

    await ctx.reply(`기사 초안 ${articles.length}개`);

    for (const a of articles.slice(0, 10)) {
      const keyboard = new InlineKeyboard()
        .text("게시", `publish:${a.id}`)
        .text("삭제", `delete:${a.id}`);
      await ctx.reply(`*${a.title}*`, { parse_mode: "Markdown", reply_markup: keyboard });
    }
  } catch (e) {
    await ctx.reply(`오류 발생: ${e}`);
  }
});

// 게시 버튼
bot.callbackQuery(/^publish:(.+)$/, async (ctx) => {
  const id = ctx.match[1];
  await ctx.answerCallbackQuery();
  try {
    await fetch(`${LOCAL_API}/api/articles/${id}/publish`, { method: "PATCH" });
    await ctx.editMessageReplyMarkup({ reply_markup: new InlineKeyboard() });
    await ctx.reply("게시 완료");
  } catch (e) {
    await ctx.reply(`오류 발생: ${e}`);
  }
});

// 삭제 버튼
bot.callbackQuery(/^delete:(.+)$/, async (ctx) => {
  const id = ctx.match[1];
  await ctx.answerCallbackQuery();
  try {
    await fetch(`${LOCAL_API}/api/articles/${id}`, { method: "DELETE" });
    await ctx.editMessageReplyMarkup({ reply_markup: new InlineKeyboard() });
    await ctx.reply("삭제 완료");
  } catch (e) {
    await ctx.reply(`오류 발생: ${e}`);
  }
});

bot.start();
console.log("EDM Star News 봇 시작됨");