export class Macro {
    /*箭头方向*/
    public static readonly ArrowDirection = {
        Up: {x:0,y:1},
        Down: {x:0,y:-1},
        Left: {x:-1,y:0},
        Right: {x:1,y:0},
        None:{x:0,y:0}
    }

    public static mapRoundHorizontalGap = 40; //地图圆点横向间距
    public static maoRoundVerticalGap = 40; //地图圆点纵向间距
    
    // 路径离开地图的边界值（当路径只剩2个点时使用）
    public static pathLeaveBoundary = {
        minX: -1000,  // 向左移动时的最小X值
        maxX: 1000,   // 向右移动时的最大X值
        minY: -1500,  // 向下移动时的最小Y值
        maxY: 1500    // 向上移动时的最大Y值
    };
}