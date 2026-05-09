-- V002: Add columns referenced by V006 seed data

-- style_profiles: add columns for detailed style data
ALTER TABLE style_profiles ADD COLUMN category TEXT;
ALTER TABLE style_profiles ADD COLUMN description TEXT;
ALTER TABLE style_profiles ADD COLUMN narrative_perspective TEXT;
ALTER TABLE style_profiles ADD COLUMN language_style TEXT;
ALTER TABLE style_profiles ADD COLUMN dialogue_ratio REAL;
ALTER TABLE style_profiles ADD COLUMN description_density TEXT;
ALTER TABLE style_profiles ADD COLUMN pace_profile TEXT;
ALTER TABLE style_profiles ADD COLUMN sample_text TEXT;

-- banned_names: add reason column
ALTER TABLE banned_names ADD COLUMN reason TEXT;

-- banned_book_titles: add reason and heat_level columns
ALTER TABLE banned_book_titles ADD COLUMN reason TEXT;
ALTER TABLE banned_book_titles ADD COLUMN heat_level TEXT;
