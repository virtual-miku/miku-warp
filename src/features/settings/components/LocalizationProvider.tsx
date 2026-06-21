import { useMemo, type ReactNode } from 'react'
import { translate, type AppLanguage } from '../domain/localization'
import {
  LocalizationContext,
  type LocalizationContextValue,
} from './localization-context'

export function LocalizationProvider({
  children,
  language,
}: {
  children: ReactNode
  language: AppLanguage
}) {
  const value = useMemo<LocalizationContextValue>(
    () => ({
      language,
      t: (key, values) => translate(language, key, values),
    }),
    [language],
  )

  return (
    <LocalizationContext.Provider value={value}>
      {children}
    </LocalizationContext.Provider>
  )
}
