const id = "理论无敌-我在合欢宗开网课";
const isSafe = (
  typeof id === "string" &&
  id.length > 0 &&
  id.trim() === id &&
  id !== "." &&
  id !== ".." &&
  !id.includes("..") &&
  !/[\\/\0]/.test(id)
);
console.log("isSafe:", isSafe);
