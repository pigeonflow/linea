const r = await fetch('http://localhost:3000/api/ai/command', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({prompt: 'draw a 4x3m bedroom'})
})
console.log('status:', r.status)
console.log('body:', await r.text())
