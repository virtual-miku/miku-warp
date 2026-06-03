import type { ButtonHTMLAttributes, ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

type AppButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode
  icon?: LucideIcon
  variant?: 'default' | 'ghost'
}

export function AppButton({
  children,
  className,
  icon: Icon,
  type = 'button',
  variant = 'default',
  ...buttonProps
}: AppButtonProps) {
  const classes = [
    'app-button',
    variant === 'ghost' ? 'app-button-ghost' : undefined,
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <button
      className={classes}
      type={type}
      {...buttonProps}
    >
      {Icon ? <Icon size={16} aria-hidden="true" /> : null}
      {children}
    </button>
  )
}
