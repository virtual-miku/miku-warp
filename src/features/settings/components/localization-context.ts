import { createContext, useContext } from 'react'
import {
  translate,
  type AppLanguage,
  type Translator,
} from '../domain/localization'

export type LocalizationContextValue = {
  language: AppLanguage
  t: Translator
}

export const LocalizationContext = createContext<LocalizationContextValue>({
  language: 'en',
  t: (key, values) => translate('en', key, values),
})

export function useLocalization() {
  return useContext(LocalizationContext)
}
