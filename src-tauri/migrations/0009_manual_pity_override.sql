ALTER TABLE warp_pulls
ADD COLUMN manual_pity_override INTEGER
CHECK (manual_pity_override IS NULL OR manual_pity_override >= 1);
