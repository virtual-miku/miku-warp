import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react'
import type { LucideIcon } from 'lucide-react'

type AppButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode
  icon?: LucideIcon
  ref?: Ref<HTMLButtonElement>
  variant?: 'default' | 'ghost'
}

export function AppButton({
  children,
  className,
  icon: Icon,
  ref,
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
      ref={ref}
      type={type}
      {...buttonProps}
    >
      {Icon ? <Icon size={16} aria-hidden="true" /> : null}
      {children}
    </button>
  )
}
