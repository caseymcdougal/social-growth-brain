export function scrollToSection(id: string, options: { expand?: boolean } = {}) {
  const target = document.getElementById(id);
  if (!target) return;

  if (options.expand) {
    let element: HTMLElement | null = target;
    while (element) {
      if (element.tagName === "DETAILS" && element instanceof HTMLDetailsElement && !element.open) {
        element.open = true;
      }
      element = element.parentElement;
    }
  }

  target.classList.add("scroll-target-focus");
  target.scrollIntoView({ block: "start", behavior: "smooth" });
  window.setTimeout(() => target.classList.remove("scroll-target-focus"), 2000);
}