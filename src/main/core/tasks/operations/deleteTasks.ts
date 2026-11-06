import { inArray } from 'drizzle-orm';
import { db } from '@main/db/client';
import { tasks } from '@main/db/schema';
import type { DeleteTaskOptions } from '@shared/tasks';
import { deleteTask } from './deleteTask';

export async function deleteTasks(
  projectId: string,
  taskIds: string[],
  options?: DeleteTaskOptions
): Promise<void> {
  if (taskIds.length === 0) return;
  const selected = await db
    .select({ projectId: tasks.projectId })
    .from(tasks)
    .where(inArray(tasks.id, taskIds));
  if (selected.some((task) => task.projectId !== projectId)) {
    throw new Error(`Task does not belong to project: ${projectId}`);
  }
  await Promise.all(taskIds.map((id) => deleteTask(projectId, id, options)));
}
