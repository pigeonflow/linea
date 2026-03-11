import Link from 'next/link'

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-white text-gray-900">
      <div className="text-center max-w-lg px-6">
        <h1 className="text-5xl font-bold tracking-tight mb-3">Linea</h1>
        <p className="text-xl text-gray-500 mb-8">AI-first CAD for architects.<br />Draw what you mean.</p>
        <Link
          href="/editor"
          className="inline-block bg-black text-white text-sm font-medium px-6 py-3 rounded-full hover:bg-gray-800 transition-colors"
        >
          Open Editor →
        </Link>
      </div>
    </main>
  )
}
