import { useEffect } from "react";
// Keeps document.title and the meta description in step with the hash route.
export function useSeo(title, description) {
  useEffect(() => {
    document.title = title;
    if (description) document.querySelector('meta[name="description"]')?.setAttribute("content", description);
  }, [title, description]);
}
