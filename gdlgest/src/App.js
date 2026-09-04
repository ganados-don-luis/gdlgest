import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Inicio from './pages/Inicio';
import EERR from './pages/EERR';
import MargenBruto from './pages/MargenBruto';
import Indicadores from './pages/Indicadores';
import FlujoFondos from './pages/FlujoFondos';
import ProtectedRoute from './components/ProtectedRoute';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route
          path="/inicio"
          element={
            <ProtectedRoute>
              <Inicio />
            </ProtectedRoute>
          }
        />
        <Route
          path="/eerr"
          element={
            <ProtectedRoute>
              <EERR />
            </ProtectedRoute>
          }
        />
        <Route
          path="/margen"
          element={
            <ProtectedRoute>
              <MargenBruto />
            </ProtectedRoute>
          }
        />
        <Route
          path="/indicadores"
          element={
            <ProtectedRoute>
              <Indicadores />
            </ProtectedRoute>
          }
        />
        <Route
          path="/flujo"
          element={
            <ProtectedRoute>
              <FlujoFondos />
            </ProtectedRoute>
          }
        />
        {/* Redirigir cualquier ruta desconocida a la raíz */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}

export default App;