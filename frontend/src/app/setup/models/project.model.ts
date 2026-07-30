export interface Project {
  id: string;
  name: string;
  location: string;
  hasThumbnail: boolean;
  totalPlots: number;
  availablePlots: number;
  soldPlots: number;
  createdAt: string;
}

export interface ProjectRequest {
  name: string;
  location: string;
}

export type PlotType = 'NORMAL' | 'CORNER';
export type PlotStatus = 'AVAILABLE' | 'BOOKED' | 'SOLD';

export interface Plot {
  id: string;
  plotNo: string;
  plotType: PlotType;
  areaSqft: number;
  rate: number;
  price: number;
  status: PlotStatus;
}

export interface PlotRequest {
  plotNo: string;
  plotType: PlotType;
  areaSqft: number;
  rate: number;
  price: number;
  status?: PlotStatus | null;
}

export interface PlotPageResponse {
  plots: Plot[];
  page: number;
  size: number;
  totalElements: number;
}

export interface CsvRowError {
  rowNumber: number;
  field: string;
  message: string;
}

export interface CsvValidationResponse {
  totalRows: number;
  validRows: number;
  errors: CsvRowError[];
}
