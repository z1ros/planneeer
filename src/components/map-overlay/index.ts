export { default as LeftSidebar } from './LeftSidebar';
export { default as RightItineraryPanel } from './RightItineraryPanel';
export { default as BottomSearchBar } from './BottomSearchBar';

export interface ItineraryItem {
  id: string;
  type: 'transit' | 'food' | 'rideshare' | 'attraction' | 'event';
  name: string;
  duration?: string;
  price?: string;
  priceRange?: string;
  icon: string;
  iconBg: string;
  address?: string;
  description?: string;
  tags?: string[];
  rating?: number;
  reviewCount?: number;
}

export interface BudgetData {
  food: number;
  activity: number;
  transit: number;
}
