import * as React from "react"

const MOBILE_BREAKPOINT = 768

function getIsMobile(): boolean {
  if (typeof window === "undefined") return false
  return window.innerWidth < MOBILE_BREAKPOINT
}

export function useIsMobile() {
  /* Lazy initial read so the effect only subscribes to changes — avoids the
   * synchronous setState-in-effect the React Compiler lint flags. SSR returns
   * false; the subscription corrects it on the client if it differs. */
  const [isMobile, setIsMobile] = React.useState<boolean>(getIsMobile)

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }
    mql.addEventListener("change", onChange)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return isMobile
}
