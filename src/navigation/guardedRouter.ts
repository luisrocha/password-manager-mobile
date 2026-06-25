import { router, type Href } from "expo-router"

const NAVIGATION_GUARD_MS = 800

let isPushNavigationLocked = false

export function guardedPush(href: Href) {
  if (isPushNavigationLocked) return

  isPushNavigationLocked = true
  router.push(href)

  setTimeout(() => {
    isPushNavigationLocked = false
  }, NAVIGATION_GUARD_MS)
}
