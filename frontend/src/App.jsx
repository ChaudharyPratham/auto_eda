import { Routes, Route } from 'react-router-dom'
import Home from './pages/Home'
import Dashboard from './pages/Dashboard'
import ImageDashboard from './pages/ImageDashboard'
import MultiDashboard from './pages/MultiDashboard'

function App() {
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/dashboard/:fileId" element={<Dashboard />} />
        <Route path="/image-dashboard/:folderId" element={<ImageDashboard />} />
        <Route path="/multi-dashboard" element={<MultiDashboard />} />
      </Routes>
    </div>
  )
}

export default App
