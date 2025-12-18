export class Macro {
    /*箭头方向*/
    public static readonly ArrowDirection = {
        Up: {x:0,y:1},
        Down: {x:0,y:-1},
        Left: {x:-1,y:0},
        Right: {x:1,y:0},
        None:{x:0,y:0}
    }

    public static mapRoundHorizontalGap = 35; //地图圆点横向间距
    public static maoRoundVerticalGap = 40; //地图圆点纵向间距
}