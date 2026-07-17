import { Task, HistoryEntry, MeetingNote, AreaDayRecord } from '../../types';

export type TrackingItemType = 'task' | 'history' | 'note' | 'hours' | 'opportunity';

export interface TrackingHours {
    opportunityId: string;
    opportunityTitle: string;
    area: string;
    hours: number;
    date: string;
}

export interface TrackingWorkItem {
    id: string;
    type: TrackingItemType;
    date: string;
    opportunityId: string;
    opportunityTitle: string;
    opportunityAlias?: string;
    title: string;
    description?: string;
    status?: string;
    data?: any; // Original object (Task, Note, etc.)
}

export interface TrackingFilters {
    opportunityIds: string[];
    taskStatuses: string[];
    taskPriorities: string[];
    searchQuery: string;
    areas: string[];
    activeOnly: boolean;
    calendarizedFilter: 'all' | 'calendarized' | 'not-calendarized';
    itemTypes: TrackingItemType[];
}

export type TrackingViewMode = 'month' | 'week' | 'work_week' | 'day';
