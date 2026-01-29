import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Web3Provider } from './contexts/Web3Context';
import HomePage from './pages/HomePage';
import Dashboard from './pages/Dashboard';
import MatrixTree from './pages/MatrixTree';
import './App.css';

function App() {
  return (
    <Web3Provider>
      <Router>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/matrix" element={<MatrixTree />} />
        </Routes>
      </Router>
    </Web3Provider>
  );
}

export default App;
