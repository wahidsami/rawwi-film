import { httpClient } from '../api/httpClient';

export interface Activity {
  id: string;
  action: string;
  actor: string;
  time: string;
  target?: string;
}

export const activityService = {
  listRecent: (): Promise<Activity[]> => {
    return httpClient.get('/activity/recent') as Promise<Activity[]>;
  }
};
