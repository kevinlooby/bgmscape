import { useEffect, useState } from 'react'

/** Returns true when the given media-query string currently matches.
 *
 *  Subscribes to changes via `MediaQueryList.addEventListener('change', ...)`
 *  so the component re-renders on viewport resize / orientation flips. SSR-safe:
 *  reads `false` until the first effect runs on the client.
 *
 *  Usage:
 *    const isWide = useMediaQuery('(min-width: 1200px)')
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false
    return window.matchMedia(query).matches
  })

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mql = window.matchMedia(query)
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches)
    setMatches(mql.matches)  // sync in case state was stale
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [query])

  return matches
}
