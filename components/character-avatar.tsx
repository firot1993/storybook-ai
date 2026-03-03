import Image from 'next/image'

interface CharacterAvatarProps {
  /** Image URL (data URI or remote) */
  src?: string | null
  name?: string
  /** Displayed when no image is available */
  fallbackEmoji?: string
  size?: number
  className?: string
  /** Additional class for the outer wrapper div */
  wrapperClassName?: string
}

/**
 * Displays a character portrait with a rounded border.
 * Falls back to an emoji placeholder when no image is available.
 */
export function CharacterAvatar({
  src,
  name = '',
  fallbackEmoji = '📖',
  size = 56,
  className = '',
  wrapperClassName = '',
}: CharacterAvatarProps) {
  const rounded = 'rounded-2xl'
  const border = 'border-2 border-forest-100'

  if (src) {
    return (
      <div
        className={`overflow-hidden shadow-sm ${rounded} ${border} ${wrapperClassName}`}
        style={{ width: size, height: size, flexShrink: 0 }}
      >
        <Image
          src={src}
          alt={name}
          width={size}
          height={size}
          className={`object-cover w-full h-full ${className}`}
        />
      </div>
    )
  }

  return (
    <div
      className={`bg-forest-100 flex items-center justify-center ${rounded} ${border} ${wrapperClassName}`}
      style={{ width: size, height: size, flexShrink: 0 }}
    >
      <span style={{ fontSize: size * 0.4 }}>{fallbackEmoji}</span>
    </div>
  )
}
