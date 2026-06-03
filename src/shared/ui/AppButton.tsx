import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

type AppButtonProps = {
  children: ReactNode
  icon?: LucideIcon
  variant?: 'default' | 'ghost'
}

export function AppButton({
  children,
  icon: Icon,
  variant = 'default',
}: AppButtonProps) {
  return (
    <button
      className={variant === 'ghost' ? 'app-button app-button-ghost' : 'app-button'}
      type="button"
    >
      {Icon ? <Icon size={16} aria-hidden="true" /> : null}
      {children}
    </button>
  )
}
