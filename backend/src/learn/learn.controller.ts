import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { User } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CompleteLessonDto } from './dto/complete-lesson.dto';
import { LearnService } from './learn.service';

@Controller('learn')
@UseGuards(JwtAuthGuard)
export class LearnController {
  constructor(private readonly learn: LearnService) {}

  /// The caller's lesson completions + best quiz scores.
  @Get('progress')
  progress(@CurrentUser() user: User) {
    return this.learn.getProgress(user.id);
  }

  /// Mark a lesson finished (optionally recording the end-of-lesson quiz).
  @Post('lessons/:lessonId/complete')
  complete(
    @CurrentUser() user: User,
    @Param('lessonId') lessonId: string,
    @Body() dto: CompleteLessonDto,
  ) {
    return this.learn.completeLesson(user.id, lessonId, dto.score, dto.total);
  }
}
