import { Routes, Route } from 'react-router-dom'
import Home from './pages/Home'
import Dashboard from './pages/Dashboard'

function App() {
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/dashboard/:fileId" element={<Dashboard />} />
      </Routes>
    </div>
  )
}

export default App
