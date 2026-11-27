import {expect,type Page} from '@playwright/test';

/** A connected run selects its lead agent, which replaces the team list. Return to the list to reach every member.
 *  Replay needs a longer timeout than the default: switching to it fetches the run's full event history first. */
export async function showTeam(page:Page){
  await expect(page.getByText('AGENT INSPECTOR')).toBeVisible({timeout:15000});
  await page.getByRole('button',{name:'All agents'}).click();
}
