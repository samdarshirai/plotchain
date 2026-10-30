export interface Project {
  id: string;
  name: string;
  location: string;
  hasThumbnail: boolean;
  totalPlots: number;
  availablePlots: number;
  soldPlots: number;
  createdAt: string;
  masterProjectId?: string | null;
  cornerExtraPercent?: number;
  parkFacingExtraPercent?: number;
  roadSideExtraPercent?: number;
}

export interface ProjectRequest {
  name: string;
  location: string;
  cornerExtraPercent?: number;
  parkFacingExtraPercent?: number;
  roadSideExtraPercent?: number;
}

export type PlotType = 'NORMAL' | 'CORNER' | 'PARK_FACING' | 'ROAD_SIDE' | 'CORNER_PARK_FACING' | 'CORNER_ROAD_SIDE';
export const PLOT_TYPES: PlotType[] = ['NORMAL', 'CORNER', 'PARK_FACING', 'ROAD_SIDE', 'CORNER_PARK_FACING', 'CORNER_ROAD_SIDE'];
export type PlotStatus = 'AVAILABLE' | 'BOOKED' | 'SOLD';

export interface Plot {
  id: string;
  plotNo: string;
  plotType: PlotType;
  areaSqft: number;
  rate: number;
  price: number;
  extraPrice?: number;
  extraPercent?: number;
  roadSizeFt?: number | null;
  status: PlotStatus;
}

export interface PlotRequest {
  plotNo: string;
  plotType: PlotType;
  areaSqft: number;
  rate: number;
  price: number;
  extraPrice?: number;
  extraPercent?: number;
  roadSizeFt?: number | null;
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
