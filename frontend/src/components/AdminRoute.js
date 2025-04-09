// src/components/AdminRoute.js
import React from 'react';
import { Navigate } from 'react-router-dom';

const AdminRoute = ({ user, children }) => {
  return user && user.role === 'ADMIN' ? children : <Navigate to="/dashboard" />;
};

export default AdminRoute;