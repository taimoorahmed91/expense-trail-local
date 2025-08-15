import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

import App from './App.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import MyView from './pages/MyView.jsx';
import GroupView from './pages/GroupView.jsx';
import AddExpense from './pages/AddExpense.jsx';
import EditExpense from './pages/EditExpense.jsx';
import ViewExpenses from './pages/ViewExpenses.jsx';
import AdminUsers from './pages/AdminUsers.jsx';
import AdminGroups from './pages/AdminGroups.jsx';
import Categories from './pages/Categories.jsx';
import Budget from './pages/Budget.jsx';
import Analysis from './pages/Analysis.jsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<App />}>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/me" element={<MyView />} />
          <Route path="/me/add" element={<AddExpense />} />
          <Route path="/me/edit/:id" element={<EditExpense />} />
          <Route path="/view" element={<ViewExpenses />} />
          <Route path="/group" element={<GroupView />} />
          <Route path="/categories" element={<Categories />} />
          <Route path="/budget" element={<Budget />} />
          <Route path="/analysis" element={<Analysis />} />
          {/* Superadmin-only pages (gated inside the pages) */}
          <Route path="/admin/users" element={<AdminUsers />} />
          <Route path="/admin/groups" element={<AdminGroups />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
