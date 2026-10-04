import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

// The type-scale tokens defined in theme.css. tailwind-merge only knows the
// built-in t-shirt sizes, and would otherwise read `text-label` as a text
// colour — dropping a real colour (or size) class it "conflicts" with.
export const TYPE_SCALE = [
  'micro',
  'caption',
  'label',
  'small',
  'body',
  'ui',
  'title',
  'subhead',
  'heading',
  'heading-lg',
  'page',
] as const

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: [...TYPE_SCALE] }],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
