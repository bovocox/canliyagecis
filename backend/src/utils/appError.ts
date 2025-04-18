export class AppError extends Error {
  public statusCode: number;

  constructor(public code: string, message: string) {
    super(message);
    this.name = 'AppError';
    this.statusCode = this.getStatusCode(code);
  }

  private getStatusCode(code: string): number {
    switch (code) {
      case 'UNAUTHORIZED':
        return 401;
      case 'MISSING_CHANNEL_ID':
        return 400;
      case 'CHANNEL_NOT_FOUND':
        return 404;
      default:
        return 500;
    }
  }

  static badRequest(code: string, message: string): AppError {
    return new AppError(code, message);
  }

  static notFound(code: string, message: string): AppError {
    return new AppError(code, message);
  }

  static internal(code: string, message: string): AppError {
    return new AppError(code, message);
  }

  static unauthorized(code: string, message: string): AppError {
    return new AppError(code, message);
  }
} 