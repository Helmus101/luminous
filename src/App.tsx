import { Routes, Route } from 'react-router-dom'
import './App.css'
import LandingPage from './components/LandingPage'
import ChatPage from './components/ChatPage'
import SignInPage from './components/SignInPage'
import WaitlistPage from './components/WaitlistPage'

function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/chat" element={<ChatPage />} />
      <Route path="/signin" element={<SignInPage />} />
      <Route path="/waitlist" element={<WaitlistPage />} />
    </Routes>
  )
}

export default App