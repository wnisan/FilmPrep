-- New quiz formats: build a sentence from words and "which line did you hear"
ALTER TABLE quiz_questions DROP CONSTRAINT IF EXISTS quiz_questions_question_type_check;
ALTER TABLE quiz_questions ADD CONSTRAINT quiz_questions_question_type_check
  CHECK (question_type IN ('single_choice', 'true_false', 'matching', 'fill_blank', 'word_order', 'listening'));
