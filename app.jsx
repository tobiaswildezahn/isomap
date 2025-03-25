import React, { useState, useRef, useEffect, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import debounce from 'lodash/debounce';

const API_KEY = "5b3ce3597851110001cf6248c1f01a7cac77443a8df943d587b810b8";

export default function Dashboard() {
  const [time, setTime] = useState(5);
  const [speed, setSpeed] = useState(50);
  const [locations, setLocations] = useState([]);
  const [totalArea, setTotalArea] = useState(0);
  const [totalPopulation, setTotalPopulation] = useState(0);
  const mapContainer = useRef(null);
  const map = useRef(null);
  const layersRef = useRef([]);

  const calculateDistance = useCallback((spd) => ((time / 60) * spd).toFixed(2), [time]);
  const distanceMeters = useCallback(() => ((time / 60) * speed * 1000).toFixed(0), [time, speed]);

  const sensitivityData = Array.from({ length: 15 }, (_, i) => {
    const spd = 10 + i * 10;
    return { speed: spd, distance: parseFloat(calculateDistance(spd)) };
  });

  const initializeMap = () => {
    map.current = L.map(mapContainer.current, { minZoom: 6, maxZoom: 18 }).setView([53.55, 10.01667], 9);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
    }).addTo(map.current);
  };

  useEffect(() => {
    initializeMap();
    return () => map.current.remove();
  }, []);

  const updateIsochrones = debounce(async () => {
    layersRef.current.forEach(({ layer }) => map.current.removeLayer(layer));
    layersRef.current = [];
    setTotalArea(0);
    setTotalPopulation(0);

    const promises = locations.map(async ({ lat, lng, marker }) => {
      const response = await fetch('https://api.openrouteservice.org/v2/isochrones/driving-car', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: API_KEY,
        },
        body: JSON.stringify({
          locations: [[lng, lat]],
          range: [distanceMeters()],
          smoothing: 0.1,
          range_type: 'distance',
          attributes: ["area", "total_pop"],
        }),
      });

      const data = await response.json();
      const { area, total_pop } = data.features[0].properties;

      setTotalArea((prev) => (parseFloat(prev) + area / 1e6).toFixed(2));
      setTotalPopulation((prev) => prev + total_pop);

      const layer = L.geoJSON(data, {
        style: {
          color: '#6366f1',
          fillColor: '#6366f1',
          fillOpacity: 0.3,
        },
      }).addTo(map.current);

      return { marker, layer };
    });

    layersRef.current = await Promise.all(promises);
  }, 500);

  const handleMapClick = async (e) => {
    const { lat, lng } = e.latlng;

    const marker = L.circleMarker([lat, lng], {
      radius: 2,
      color: 'red',
      fillColor: 'red',
      fillOpacity: 1,
    }).addTo(map.current);

    setLocations((prev) => [...prev, { lat, lng, marker }]);
  };

  useEffect(() => {
    map.current.on('click', handleMapClick);
    return () => map.current.off('click', handleMapClick);
  }, []);

  useEffect(() => {
    if (locations.length) updateIsochrones();
    return () => updateIsochrones.cancel();
  }, [distanceMeters, locations]);

  const clearIsochrones = () => {
    layersRef.current.forEach(({ layer, marker }) => {
      map.current.removeLayer(layer);
      map.current.removeLayer(marker);
    });
    layersRef.current = [];
    setLocations([]);
    setTotalArea(0);
    setTotalPopulation(0);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-4">
      <h1 className="text-4xl font-bold text-gray-800 mb-6">Rettungswagen-Simulator</h1>

      <div className="bg-white rounded-2xl shadow-lg p-4 w-full max-w-2xl mb-8">
        <label className="block font-semibold">Zeit (Minuten): {time}</label>
        <input type="range" min="1" max="60" step="1" value={time} onChange={(e) => setTime(parseInt(e.target.value))} className="w-full mb-4" />
        <label className="block font-semibold">Geschwindigkeit (km/h): {speed}</label>
        <input type="range" min="10" max="150" step="5" value={speed} onChange={(e) => setSpeed(parseInt(e.target.value))} className="w-full" />
      </div>

      <div className="flex gap-4 mb-4">
        <div className="bg-white shadow rounded-lg p-4">Gesamtfläche: {totalArea} km²</div>
        <div className="bg-white shadow rounded-lg p-4">Bevölkerung: {totalPopulation}</div>
      </div>

      <div ref={mapContainer} className="bg-white rounded-2xl shadow-lg p-4 w-full max-w-2xl" style={{ height: '400px' }} />
      <button onClick={clearIsochrones} className="my-4 bg-red-500 text-white px-4 py-2 rounded-lg shadow hover:bg-red-600">
        Alle Isochronen löschen
      </button>

      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={sensitivityData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="speed" />
          <YAxis />
          <Tooltip />
          <Legend />
          <Bar dataKey="distance" fill="#4f46e5" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
