'use client'

import dynamic from 'next/dynamic'

// tldraw must be client-only (no SSR)
const LinéaCanvas = dynamic(() => import('@/components/canvas/LineaCanvas'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-gray-50 text-gray-400 text-sm">
      Loading canvas…
    </div>
  ),
})

export default function EditorPage() {
  return (
    <div className="w-screen h-screen overflow-hidden">
      <LinéaCanvas />
    </div>
  )
}
