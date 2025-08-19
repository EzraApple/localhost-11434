export default function ChatIndexRedirect() {
  if (typeof window !== 'undefined') {
    window.location.replace('/')
  }
  return null
}


