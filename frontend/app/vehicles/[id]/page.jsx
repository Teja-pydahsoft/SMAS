"use client";

import React, { useState, useEffect, use } from 'react';
import Link from 'next/link';

export default function EquipmentProfilePage({ params }) {
  const unwrappedParams = use(params);
  const { id } = unwrappedParams;

  const [vehicle, setVehicle] = useState(null);
  const [timeline, setTimeline] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch(`/api/vehicles/${id}`).then(r => r.json()),
      fetch(`/api/equipment/idle-monitoring/timeline/${id}`).then(r => r.json())
    ]).then(([vehData, timeData]) => {
      setVehicle(vehData);
      setTimeline(timeData);
      setLoading(false);
    });
  }, [id]);

  if (loading) return <div className="p-6">Loading equipment profile...</div>;
  if (!vehicle || vehicle.error) return <div className="p-6 text-red-500">Equipment not found</div>;

  // Compute Current Status from Timeline
  let currentStatus = 'Unknown';
  let currentDept = 'None';
  let idleSince = null;
  
  if (timeline.length > 0) {
    const lastEvent = timeline[timeline.length - 1];
    if (lastEvent.type === 'movement_in') {
      currentStatus = 'Working';
      currentDept = lastEvent.details.split(' (')[0].replace('Entered ', '');
    } else if (lastEvent.type === 'movement_out' || lastEvent.type.startsWith('idle_')) {
      currentStatus = 'Idle';
      
      // Find when it started idling
      const startIdleEvent = [...timeline].reverse().find(e => e.type === 'idle_start');
      if (startIdleEvent) idleSince = new Date(startIdleEvent.timestamp);
    }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Equipment Profile: {vehicle.plateNumber}</h1>
        <Link href="/vehicles" className="text-blue-600 hover:underline">Back to Master</Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Basic Details */}
        <div className="bg-white p-6 rounded shadow space-y-4">
          <h2 className="text-lg font-bold border-b pb-2">Basic Details</h2>
          <div>
            <p className="text-sm text-gray-500">Vehicle Number</p>
            <p className="font-mono text-lg">{vehicle.plateNumber}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Equipment Type</p>
            <p>{vehicle.typeId?.name || 'Unknown'}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Category</p>
            <p>{vehicle.categoryId?.name || 'Unknown'}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Master Status</p>
            <span className={`px-2 py-1 rounded text-sm ${vehicle.status === 'Active' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
              {vehicle.status}
            </span>
          </div>
        </div>

        {/* Current Status Card */}
        <div className="bg-white p-6 rounded shadow space-y-4 md:col-span-2">
          <h2 className="text-lg font-bold border-b pb-2">Current Status</h2>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <p className="text-sm text-gray-500">State</p>
              <p className={`text-xl font-bold ${currentStatus === 'Working' ? 'text-green-600' : currentStatus === 'Idle' ? 'text-yellow-600' : 'text-gray-600'}`}>
                {currentStatus}
              </p>
            </div>
            {currentStatus === 'Working' && (
              <div>
                <p className="text-sm text-gray-500">Current Department</p>
                <p className="text-lg">{currentDept}</p>
              </div>
            )}
            {currentStatus === 'Idle' && idleSince && (
              <div>
                <p className="text-sm text-gray-500">Idle Since</p>
                <p className="text-lg">{idleSince.toLocaleString()}</p>
                <p className="text-sm text-red-500 mt-1 font-bold">
                  {Math.floor((new Date() - idleSince) / 60000)} mins ago
                </p>
              </div>
            )}
            <div>
              <p className="text-sm text-gray-500">Current Shift</p>
              <p className="text-lg">N/A</p>
            </div>
          </div>
        </div>
      </div>

      {/* AI Enrollment Data */}
      {vehicle.aiMetadata && Object.keys(vehicle.aiMetadata).length > 0 && (
        <div className="bg-white p-6 rounded shadow space-y-4">
          <h2 className="text-lg font-bold border-b pb-2">AI Enrollment Metadata</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-sm text-gray-500">Extracted Plate</p>
              <p className="font-mono">{vehicle.aiMetadata.frontPlateNumber || vehicle.aiMetadata.rearPlateNumber || 'N/A'}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Vehicle Type</p>
              <p>{vehicle.aiMetadata.vehicleType || 'N/A'}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Vehicle Color</p>
              <p>{vehicle.aiMetadata.vehicleColor || 'N/A'}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">OCR Confidence</p>
              <p>{vehicle.aiMetadata.confidence?.ocr || 0}%</p>
            </div>
          </div>
        </div>
      )}

      {/* Timeline */}
      <div className="bg-white p-6 rounded shadow">
        <h2 className="text-lg font-bold border-b pb-4 mb-4">Chronological Timeline</h2>
        {timeline.length === 0 ? (
          <p className="text-gray-500">No events recorded.</p>
        ) : (
          <div className="relative border-l-2 border-gray-200 ml-3 space-y-6">
            {timeline.map((event, idx) => {
              // Icon coloring based on event type
              let dotColor = 'bg-blue-500';
              if (event.type === 'movement_in') dotColor = 'bg-green-500';
              if (event.type === 'movement_out') dotColor = 'bg-gray-500';
              if (event.type === 'idle_start') dotColor = 'bg-yellow-500';
              if (event.type === 'idle_cleared') dotColor = 'bg-blue-500';
              if (event.type === 'idle_alert') dotColor = 'bg-red-500';

              return (
                <div key={idx} className="relative pl-6">
                  <div className={`absolute w-3 h-3 ${dotColor} rounded-full -left-[7px] top-1.5 border-2 border-white`}></div>
                  <div>
                    <h3 className="font-bold">{event.title}</h3>
                    <p className="text-sm text-gray-500">{new Date(event.timestamp).toLocaleString()}</p>
                    <p className="mt-1 text-gray-700">{event.details}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
