import { useEffect, useState } from 'react'
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Address, Bootstrap } from '@inlark/core'
import { api } from './api'
import { matchAddresses, mergeContacts, rankContacts } from './mentions'

/**
 * People matching `query`. The mail already on screen answers at once; the rest of the mailbox is
 * searched too, so someone whose mail isn't loaded in the current view can still be found.
 */
export function useContactMatches(
  suggestions: Address[],
  query: string,
  exclude: Address[] = [],
): Address[] {
  const q = query.trim().toLowerCase()
  const [settled, setSettled] = useState(q)
  useEffect(() => {
    const timer = setTimeout(() => setSettled(q), 150)
    return () => clearTimeout(timer)
  }, [q])
  const client = useQueryClient()
  const found = useQuery({
    queryKey: ['contacts', settled],
    queryFn: async () => {
      const own = new Set(
        (client.getQueryData<Bootstrap>(['bootstrap'])?.accounts || []).flatMap((a) => [
          a.email.toLowerCase(),
          ...(a.aliases || []).map((alias) => alias.email.toLowerCase()),
        ]),
      )
      const page = await api.query({
        view: 'all',
        matchAny: [
          { field: 'from', value: settled },
          { field: 'to', value: settled },
        ],
      })
      return rankContacts(page.items, own)
    },
    enabled: settled.length >= 2,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  })
  if (!q) return matchAddresses(suggestions, q, exclude)
  return matchAddresses(mergeContacts(suggestions, found.data || []), q, exclude)
}
