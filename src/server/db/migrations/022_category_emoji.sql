-- Give the seeded categories emoji icons. The icon column used to hold
-- lucide slug names that only the dashboard cards rendered; emoji show up
-- everywhere text does. Guarded on the original slug so any category the
-- user re-iconed keeps their choice, and applied per name across all
-- workspaces.

UPDATE categories SET icon = '🛒' WHERE name = 'Groceries' AND icon = 'shopping-basket';
UPDATE categories SET icon = '🍽️' WHERE name = 'Restaurants' AND icon = 'utensils-crossed';
UPDATE categories SET icon = '☕' WHERE name = 'Coffee & Cafes' AND icon = 'coffee';
UPDATE categories SET icon = '🚌' WHERE name = 'Transport' AND icon = 'tram-front';
UPDATE categories SET icon = '✈️' WHERE name = 'Travel' AND icon = 'plane';
UPDATE categories SET icon = '🛍️' WHERE name = 'Shopping' AND icon = 'shopping-bag';
UPDATE categories SET icon = '🎬' WHERE name = 'Entertainment' AND icon = 'ticket';
UPDATE categories SET icon = '💇' WHERE name = 'Personal Care' AND icon = 'sparkles';
UPDATE categories SET icon = '⚽' WHERE name = 'Sports & Hobbies' AND icon = 'dumbbell';
UPDATE categories SET icon = '🧾' WHERE name = 'Bills & Utilities' AND icon = 'receipt';
UPDATE categories SET icon = '🛋️' WHERE name = 'Home' AND icon = 'home';
UPDATE categories SET icon = '🛡️' WHERE name = 'Insurance' AND icon = 'shield';
UPDATE categories SET icon = '🔁' WHERE name = 'Subscriptions' AND icon = 'refresh-cw';
UPDATE categories SET icon = '🩺' WHERE name = 'Health' AND icon = 'heart-pulse';
UPDATE categories SET icon = '🎓' WHERE name = 'Education' AND icon = 'graduation-cap';
UPDATE categories SET icon = '👶' WHERE name = 'Kids & Childcare' AND icon = 'baby';
UPDATE categories SET icon = '🐾' WHERE name = 'Pet Care' AND icon = 'paw-print';
UPDATE categories SET icon = '🏧' WHERE name = 'Cash & ATM' AND icon = 'banknote';
UPDATE categories SET icon = '💸' WHERE name = 'Transfers' AND icon = 'arrow-left-right';
UPDATE categories SET icon = '🎁' WHERE name = 'Gifts & Donations' AND icon = 'gift';
UPDATE categories SET icon = '🏛️' WHERE name = 'Fees & Taxes' AND icon = 'landmark';
UPDATE categories SET icon = '💼' WHERE name = 'Salary' AND icon = 'briefcase';
UPDATE categories SET icon = '🧑‍💻' WHERE name = 'Freelance & Side Income' AND icon = 'briefcase';
UPDATE categories SET icon = '📈' WHERE name = 'Investment Income' AND icon = 'trending-up';
UPDATE categories SET icon = '🎖️' WHERE name = 'Miluim' AND icon = 'circle-dot';
UPDATE categories SET icon = '💵' WHERE name = 'Refunds & Reimbursements' AND icon = 'rotate-ccw';

-- Parent groups
UPDATE categories SET icon = '🍔' WHERE name = 'Food' AND icon = 'utensils-crossed';
UPDATE categories SET icon = '🚗' WHERE name = 'Transportation' AND icon = 'tram-front';
UPDATE categories SET icon = '✨' WHERE name = 'Lifestyle' AND icon = 'sparkles';
UPDATE categories SET icon = '🏠' WHERE name = 'Home & Bills' AND icon = 'home';
UPDATE categories SET icon = '🩷' WHERE name = 'Health & Family' AND icon = 'heart-pulse';
UPDATE categories SET icon = '🔄' WHERE name = 'Money Movement' AND icon = 'arrow-left-right';
