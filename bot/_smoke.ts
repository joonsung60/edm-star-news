import "dotenv/config";
import { setDefaultResultOrder } from "node:dns";
import { Agent } from "node:https";
import { Bot } from "grammy";

setDefaultResultOrder("ipv4first");
const ipv4Agent = new Agent({ family: 4, keepAlive: true });

const token = process.env.BOT_TOKEN!;
const bot = new Bot(token, {
  client: { baseFetchConfig: { agent: ipv4Agent, compress: true } },
});

(async () => {
  const t0 = Date.now();
  const me = await bot.api.getMe();
  console.log(`OK @${me.username} in ${Date.now() - t0}ms`);
})().catch((e) => {
  console.error("FAIL:", e.message ?? e);
  process.exit(1);
});
