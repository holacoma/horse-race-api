import "controllers"

document.addEventListener("htmx:configRequest", (event) => {
  const token = document.querySelector('meta[name="csrf-token"]')
  if (token) event.detail.headers["X-CSRF-Token"] = token.content
})
