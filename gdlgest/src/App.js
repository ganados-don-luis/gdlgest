import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Login from './pages/Login';
import Inicio from './pages/Inicio';
import EERR from './pages/EERR';
import MargenBruto from './pages/MargenBruto';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/inicio" element={<Inicio />} />
        <Route path="/eerr" element={<EERR />} />
        <Route path="/margen" element={<MargenBruto />} />
      </Routes>
    </Router>
  );
}

export default App;