WITH attribute_baselines AS (
	SELECT
		"id",
		10
			+ CASE "realm"
				WHEN '炼气' THEN 0
				WHEN '筑基' THEN 10
				WHEN '金丹' THEN 20
				WHEN '元婴' THEN 30
				WHEN '化神' THEN 40
				WHEN '炼虚' THEN 50
				WHEN '合体' THEN 60
				WHEN '大乘' THEN 70
				WHEN '渡劫' THEN 80
				ELSE 0
			END
			+ CASE "realm_stage"
				WHEN '初期' THEN 0
				WHEN '中期' THEN 2
				WHEN '后期' THEN 4
				WHEN '圆满' THEN 6
				ELSE 0
			END AS "natural_value"
	FROM "wanjiedaoyou_cultivators"
)
UPDATE "wanjiedaoyou_cultivators" AS cultivator
SET
	"strength" = greatest(cultivator."strength", baseline."natural_value"),
	"endurance" = greatest(cultivator."endurance", baseline."natural_value"),
	"updated_at" = now()
FROM attribute_baselines AS baseline
WHERE cultivator."id" = baseline."id"
	AND (
		cultivator."strength" < baseline."natural_value"
		OR cultivator."endurance" < baseline."natural_value"
	);
