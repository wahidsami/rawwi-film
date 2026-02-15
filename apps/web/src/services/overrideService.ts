export const overrideService = {
  async setOverride(findingId: string, overrideData: { eventType: 'not_violation' | 'hidden_from_owner'; reason: string; byUser: string }): Promise<boolean> {
    console.log('setOverride', findingId, overrideData);
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve(true);
      }, 500);
    });
  },
  
  async revertOverride(findingId: string): Promise<boolean> {
    console.log('revertOverride', findingId);
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve(true);
      }, 500);
    });
  }
};