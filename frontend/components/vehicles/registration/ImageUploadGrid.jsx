import React from 'react';
import ImageUploadCard from './ImageUploadCard';

export default function ImageUploadGrid({ files, setFiles, disabled = false }) {
  const fields = [
    { key: 'front', label: 'Front View' },
    { key: 'rear', label: 'Rear View' },
    { key: 'left', label: 'Left Side View' },
    { key: 'right', label: 'Right Side View' },
    { key: 'frontPlate', label: 'Front License Plate' },
    { key: 'rearPlate', label: 'Rear License Plate' },
  ];

  return (
    <div style={{ marginBottom: '24px' }}>
      <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>Mandatory Images</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
        {fields.map(f => (
          <ImageUploadCard 
            key={f.key}
            label={f.label}
            file={files[f.key]}
            disabled={disabled}
            onFileChange={(file) => setFiles(prev => ({ ...prev, [f.key]: file }))}
            onRemove={() => setFiles(prev => ({ ...prev, [f.key]: null }))}
          />
        ))}
      </div>
    </div>
  );
}
