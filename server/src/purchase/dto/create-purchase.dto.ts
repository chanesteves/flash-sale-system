import { IsNotEmpty, IsString, MinLength, MaxLength } from 'class-validator';

export class CreatePurchaseDto {
  @IsString()
  @IsNotEmpty({ message: 'userId is required' })
  @MinLength(1)
  @MaxLength(255)
  userId!: string;
}
