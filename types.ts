import React from 'react';

export interface PatientRecord {
  id: string; // No Atendimento
  patientName: string;
  doctor: string;
  resident: string;
  date: string;
  robsonGroup: string;
  birthType: string;
  // Details that would be "scraped" from the popup
  details?: ScrapedDetails;
}

export interface ScrapedDetails {
  bloodPressure: string;
  heartRate: string;
  temperature: string;
  notes: string;
  lastMedication: string;
}

export type ScrapingStatus = 'idle' | 'running' | 'paused' | 'completed';

export interface SidebarItem {
  label: string;
  icon?: React.ReactNode;
  active?: boolean;
}