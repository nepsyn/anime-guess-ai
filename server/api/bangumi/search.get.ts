import { searchSubjects } from '../../utils/bangumi'

export default defineEventHandler(async (event) => {
  const q = String(getQuery(event).q || '').trim()
  if (!q) return []
  return searchSubjects(q, 12)
})
