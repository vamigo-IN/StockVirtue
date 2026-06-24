import { IsInt, IsOptional, Max, Min } from 'class-validator';

/// Body for POST /learn/lessons/:lessonId/complete. Quiz score is optional —
/// a lesson with no quiz just records completion. score/total are question
/// counts (0..50 is a generous ceiling for a single lesson quiz).
export class CompleteLessonDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(50)
  score?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(50)
  total?: number;
}
