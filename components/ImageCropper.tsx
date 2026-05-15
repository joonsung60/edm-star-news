'use client'

import { useState, type SyntheticEvent } from 'react'
import ReactCrop, {
  centerCrop,
  makeAspectCrop,
  type Crop,
  type PercentCrop,
} from 'react-image-crop'
import 'react-image-crop/dist/ReactCrop.css'

type ImageCropperProps = {
  imageUrl: string
  onCropChange: (crop: PercentCrop | null) => void
  aspect?: number
}

const DEFAULT_INITIAL_WIDTH_PERCENT = 80

export function ImageCropper({ imageUrl, onCropChange, aspect }: ImageCropperProps) {
  const [crop, setCrop] = useState<Crop>()

  const handleImageLoad = (event: SyntheticEvent<HTMLImageElement>) => {
    const { naturalWidth, naturalHeight } = event.currentTarget

    const initial: PercentCrop = aspect
      ? centerCrop(
          makeAspectCrop(
            { unit: '%', width: DEFAULT_INITIAL_WIDTH_PERCENT },
            aspect,
            naturalWidth,
            naturalHeight,
          ),
          naturalWidth,
          naturalHeight,
        )
      : {
          unit: '%',
          x: (100 - DEFAULT_INITIAL_WIDTH_PERCENT) / 2,
          y: (100 - DEFAULT_INITIAL_WIDTH_PERCENT) / 2,
          width: DEFAULT_INITIAL_WIDTH_PERCENT,
          height: DEFAULT_INITIAL_WIDTH_PERCENT,
        }

    setCrop(initial)
    onCropChange(isCropValid(initial) ? initial : null)
  }

  return (
    <div className="overflow-hidden rounded border bg-gray-100 p-2">
      <ReactCrop
        crop={crop}
        aspect={aspect}
        keepSelection
        onChange={(_, percentCrop) => {
          setCrop(percentCrop)
          onCropChange(isCropValid(percentCrop) ? percentCrop : null)
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt=""
          onLoad={handleImageLoad}
          className="block max-h-[560px] w-auto max-w-full"
        />
      </ReactCrop>
    </div>
  )
}

function isCropValid(crop: PercentCrop): boolean {
  return crop.width > 0 && crop.height > 0
}

export async function getCroppedDataUrl(
  imageUrl: string,
  crop: PercentCrop,
  mimeType: 'image/jpeg' | 'image/png' = 'image/jpeg',
  quality = 0.9,
): Promise<string> {
  const image = await loadImage(imageUrl)
  const sx = Math.max(Math.round((crop.x / 100) * image.naturalWidth), 0)
  const sy = Math.max(Math.round((crop.y / 100) * image.naturalHeight), 0)
  const sw = Math.max(Math.round((crop.width / 100) * image.naturalWidth), 1)
  const sh = Math.max(Math.round((crop.height / 100) * image.naturalHeight), 1)

  const canvas = document.createElement('canvas')
  canvas.width = sw
  canvas.height = sh

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('canvas 2D 컨텍스트를 사용할 수 없습니다.')
  }

  ctx.drawImage(image, sx, sy, sw, sh, 0, 0, sw, sh)
  return canvas.toDataURL(mimeType, quality)
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('이미지를 불러오지 못했습니다.'))
    image.src = src
  })
}
