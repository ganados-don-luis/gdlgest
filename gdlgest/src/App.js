import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Login from './pages/Login';
import EERR from './pages/EERR';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/eerr" element={<EERR />} />
      </Routes>
    </Router>
  );
}

export default App;