"use client";

import React, { useState, useEffect } from 'react';
import PageTabs from '@/components/PageTabs';
import PageShell from '@/components/PageShell';

export default function VehicleCategoriesPage() {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/vehicles/categories')
      .then(res => res.json())
      .then(data => {
        setCategories(Array.isArray(data) ? data : []);
        setLoading(false);
      });
  }, []);

  const tabs = [
    { label: 'Vehicles', path: '/vehicles' },
    { label: 'Categories', path: '/vehicles/categories' },
    { label: 'Types', path: '/vehicles/types' }
  ];

  const toolbar = (
    <button className="bg-blue-600 text-white px-4 py-2 rounded">Add Category</button>
  );

  return (
    <PageShell title="Vehicle Master - Categories" description="Manage vehicle categories" toolbar={toolbar}>
      <PageTabs tabs={tabs} />
      <div className="p-6">
      
      <div className="bg-white rounded shadow p-4">
        {loading ? <p>Loading...</p> : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b">
                <th className="p-2">Name</th>
                <th className="p-2">Description</th>
                <th className="p-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {categories.map(c => (
                <tr key={c._id} className="border-b hover:bg-gray-50">
                  <td className="p-2">{c.name}</td>
                  <td className="p-2 text-gray-600">{c.description}</td>
                  <td className="p-2">{c.isActive ? 'Active' : 'Inactive'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      </div>
    </PageShell>
  );
}
